<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableCreateFfoersterBzwjenaTermineRelations extends Migration
{
    public function up()
    {
        Schema::create('ffoerster_bzwjena_termine_relations', function($table)
        {
            $table->engine = 'InnoDB';
            $table->integer('termin_id');
            $table->integer('angebot_id');
            $table->primary(['termin_id','angebot_id']);
        });
    }
    
    public function down()
    {
        Schema::dropIfExists('ffoerster_bzwjena_termine_relations');
    }
}
